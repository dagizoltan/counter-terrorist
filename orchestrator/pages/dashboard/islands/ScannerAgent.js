class ScannerAgent extends HTMLElement {
  connectedCallback() {
    // No auto-scan; user clicks the Run Scan button  
  }
}
customElements.define('scanner-agent', ScannerAgent);
