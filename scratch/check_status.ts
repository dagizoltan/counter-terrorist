const resp = await fetch("http://localhost:8001/api/agent/status", {
    headers: {
        "X-CT-Token": "PROVISIONAL_DEVELOPMENT_BYPASS_UNSAFE"
    }
});
console.log(JSON.stringify(await resp.json(), null, 2));
