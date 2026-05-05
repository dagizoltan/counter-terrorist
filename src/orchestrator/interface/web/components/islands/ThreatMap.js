/**
 * ThreatMap Island
 * High-fidelity WebGL Global Threat Visualization using Three.js.
 */
class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.attacks = [];
    this.isInitialized = false;
  }

  async connectedCallback() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // Inject Three.js and dependencies
    await this.loadDependencies();
    this.initScene();
    this.connect();
    
    window.addEventListener('resize', () => this.onResize());
  }

  async loadDependencies() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.type = 'importmap';
      script.innerHTML = JSON.stringify({
        imports: {
          "three": "https://esm.sh/three@0.160.0",
          "three/examples/jsm/": "https://esm.sh/three@0.160.0/examples/jsm/"
        }
      });
      document.head.appendChild(script);
      
      const mainScript = document.createElement('script');
      mainScript.type = 'module';
      mainScript.innerHTML = `
        import * as THREE from 'three';
        window.THREE = THREE;
        window.dispatchEvent(new CustomEvent('three-loaded'));
      `;
      document.head.appendChild(mainScript);
      
      window.addEventListener('three-loaded', () => resolve(), { once: true });
    });
  }

  initScene() {
    const THREE = window.THREE;
    const width = this.offsetWidth || window.innerWidth;
    const height = this.offsetHeight || 750;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.z = 250;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.appendChild(this.renderer.domElement);

    // ── THE_GLOBE ──────────────────────────────────────────────────
    const globeGeometry = new THREE.SphereGeometry(100, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x0a0a0f,
      emissive: 0x112244,
      specular: 0x555555,
      shininess: 30,
      transparent: true,
      opacity: 0.9
    });
    this.globe = new THREE.Mesh(globeGeometry, globeMaterial);
    this.scene.add(this.globe);

    // ── ATMOSPHERE ────────────────────────────────────────────────
    const atmosGeometry = new THREE.SphereGeometry(105, 64, 64);
    const atmosMaterial = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        glowColor: { value: new THREE.Color(0x00ffff) },
        viewVector: { value: this.camera.position }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(glowColor, intensity * 0.4);
        }
      `,
      side: THREE.BackSide
    });
    this.atmos = new THREE.Mesh(atmosGeometry, atmosMaterial);
    this.scene.add(this.atmos);

    // ── LIGHTING ──────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 3, 5);
    this.scene.add(dirLight);

    // ── GRID_OVERLAY ──────────────────────────────────────────────
    const gridHelper = new THREE.PolarGridHelper(150, 16, 8, 64, 0x00ffff, 0x112233);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -20;
    this.scene.add(gridHelper);

    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    if (this.globe) {
      this.globe.rotation.y += 0.001;
      this.atmos.rotation.y += 0.001;
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'AUDIT_EVENT' && payload.data?.type === 'THREAT') {
           this.plotAttack(payload.data.data?.geo);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  plotAttack(geo) {
    if (!geo || !geo.lat || !geo.lon) return;
    
    const THREE = window.THREE;
    const phi = (90 - geo.lat) * (Math.PI / 180);
    const theta = (geo.lon + 180) * (Math.PI / 180);

    const x = -100 * Math.sin(phi) * Math.cos(theta);
    const y = 100 * Math.cos(phi);
    const z = 100 * Math.sin(phi) * Math.sin(theta);

    // Create tactical point
    const geometry = new THREE.SphereGeometry(1.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const point = new THREE.Mesh(geometry, material);
    point.position.set(x, y, z);
    this.scene.add(point);

    // Create arc
    const start = new THREE.Vector3(x, y, z);
    const end = new THREE.Vector3(0, 0, 0); // Center or local node position
    
    // Cleanup after 5s
    setTimeout(() => {
      this.scene.remove(point);
      geometry.dispose();
      material.dispose();
    }, 5000);
  }
}

customElements.define('threat-map', ThreatMap);

