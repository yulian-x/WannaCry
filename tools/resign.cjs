const fs=require("fs"),crypto=require("crypto"),path=require("path");
const ROOT="C:/Users/Nami/Desktop/WannaCry";
const priv=fs.readFileSync("C:/Users/Nami/Desktop/Loader/keys/private.pem");
const pub=fs.readFileSync("C:/Users/Nami/Desktop/Loader/keys/public.pem");
const m={version:"1.0.3",loader_version:"1.0.0",file:"ZorroXit-1.0.3.bin",
 url:"https://github.com/yulian-x/WannaCry/releases/download/v1.0.3/ZorroXit-1.0.3.bin",
 sha256:"6844ba55a77ecc554835b2a38eb055f563ff340fd0bcd2074c1dcde00bb3a98b",notes:"auto-update test"};
const payload=JSON.stringify(m);
const sig=crypto.sign("sha256",Buffer.from(payload,"utf8"),{key:priv,dsaEncoding:"ieee-p1363"});
const body=JSON.stringify({...m,signature:sig.toString("base64")});
fs.writeFileSync(path.join(ROOT,"latest.json"),body);
// simulacion exacta de lo que hace el loader en C++
const pos=body.indexOf('"signature"');
const comma=body.lastIndexOf(",",pos);
const end=body.indexOf("}",body.indexOf('"',body.indexOf(":",pos)+1));
const unsigned=body.slice(0,comma)+body.slice(end);
const okRecon = unsigned===payload;
const okSig = crypto.verify("sha256",Buffer.from(unsigned,"utf8"),{key:pub,dsaEncoding:"ieee-p1363"},sig);
console.log("bytes firma:",sig.length,"| reconstruccion ok:",okRecon,"| firma valida:",okSig);
