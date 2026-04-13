const https = require("https");
const http = require("http");
const tls = require("tls");
const apiKey = process.env.GAUZ_LLM_API_KEY;
const msg = "hello";
const body = JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:msg}],max_tokens:10,temperature:0.3});

function viaProxy(host, port, path, cb) {
  const opts = {hostname:"localhost",port:7897,method:"CONNECT",headers:{host:host+":"+port}};
  const req = http.request(opts);
  req.on("error", e => cb(0, "Proxy error: "+e.message));
  req.on("connect", (_, socket) => {
    const ssl = tls.connect({host, port, socket}, () => {
      const r = https.request({host, port, path, method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey,"Content-Length":Buffer.byteLength(body)}}, res => {
        let d=""; res.on("data",c=>d+=c); res.on("end",()=>cb(res.statusCode,d));
      });
      r.on("error", e => cb(0, "SSL error: "+e.message));
      r.write(body); r.end();
    });
  });
  req.setTimeout(15000, () => { cb(0, "TIMEOUT"); req.destroy(); });
  req.end();
}

console.log("Testing buildsense.asia...");
viaProxy("buildsense.asia", 443, "/v1/chat/completions", (status, data) => {
  console.log("Status:", status);
  console.log("Response:", data.slice(0,500));
});
