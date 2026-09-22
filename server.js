import "dotenv/config";
import express from "express";
import session from "express-session";
import passport from "passport";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";
import multer from "multer";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url)), app=express(), db=new Database("data.sqlite");
fs.mkdirSync("uploads",{recursive:true});
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,google_id TEXT UNIQUE,name TEXT,email TEXT,picture TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,public_id TEXT UNIQUE,user_id INTEGER,product TEXT,price INTEGER,player_id TEXT,player_name TEXT,status TEXT,receipt TEXT,provider_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);

app.use(express.json()); app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||"CHANGE",resave:false,saveUninitialized:false}));
app.use(passport.initialize()); app.use(passport.session());
passport.serializeUser((u,d)=>d(null,u.id)); passport.deserializeUser((id,d)=>d(null,db.prepare("SELECT * FROM users WHERE id=?").get(id)||false));
if(process.env.GOOGLE_CLIENT_ID) passport.use(new GoogleStrategy({clientID:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,callbackURL:process.env.GOOGLE_CALLBACK_URL},(_,__,profile,done)=>{
 const email=profile.emails?.[0]?.value||"", old=db.prepare("SELECT * FROM users WHERE google_id=? OR email=?").get(profile.id,email);
 if(old){db.prepare("UPDATE users SET google_id=?,name=?,picture=? WHERE id=?").run(profile.id,profile.displayName,profile.photos?.[0]?.value||"",old.id);return done(null,db.prepare("SELECT * FROM users WHERE id=?").get(old.id))}
 const r=db.prepare("INSERT INTO users(google_id,name,email,picture) VALUES(?,?,?,?)").run(profile.id,profile.displayName,email,profile.photos?.[0]?.value||"");
 done(null,db.prepare("SELECT * FROM users WHERE id=?").get(r.lastInsertRowid));
}));
app.get("/auth/google",(req,res)=>passport.authenticate("google",{scope:["profile","email"]})(req,res));
app.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/"}),(req,res)=>res.redirect("/"));
app.post("/auth/admin",(req,res)=>{if(req.body.code!==process.env.ADMIN_CODE)return res.status(401).json({error:"Código incorrecto"});req.session.admin=true;res.json({ok:true})});
const user=(req,res,n)=>req.user?n():res.status(401).json({error:"Inicia sesión"});
const admin=(req,res,n)=>req.session.admin?n():res.status(403).json({error:"Admin requerido"});

const products=[
["5600","5,600 + 560 💎",680,"FAZER_OFFER_5600"],["2180","2,180 + 218 💎",290,"FAZER_OFFER_2180"],["1060","1,060 + 106 💎",150,"FAZER_OFFER_1060"],["572","572 + 52 💎",90,"FAZER_OFFER_572"],
["110","110 💎",12,"FAZER_OFFER_110"],["341","341 💎",40,"FAZER_OFFER_341"],["572id","572 💎",70,"FAZER_OFFER_572_ID"],["1166","1,166 💎",130,"FAZER_OFFER_1166"],["2398","2,398 💎",250,"FAZER_OFFER_2398"],["6160","6,160 💎",550,"FAZER_OFFER_6160"],["booyah","Pase Booyah",35,"FAZER_OFFER_BOOYAH"]];

app.get("/api/config",(req,res)=>res.json({user:req.user||null,products,payment:{bank:process.env.PAYMENT_BANK,holder:process.env.PAYMENT_HOLDER,card:process.env.PAYMENT_CARD,concept:process.env.PAYMENT_CONCEPT}}));

app.post("/api/validate-id",user,async(req,res)=>{
 const id=String(req.body.playerId||"").trim();
 if(!/^\d{5,15}$/.test(id))return res.status(400).json({error:"ID no válido"});
 if(!process.env.FAZER_API_KEY||!process.env.FAZER_CATEGORY_ID)return res.status(503).json({error:"Proveedor aún no configurado"});
 try{const r=await fetch(`${process.env.FAZER_BASE_URL}/topups/validate-id`,{method:"POST",headers:{"X-API-Key":process.env.FAZER_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({category_id:process.env.FAZER_CATEGORY_ID,fields:{player_id:id}})}),d=await r.json();res.status(r.ok?200:400).json(d)}catch{res.status(502).json({error:"Error con el proveedor"})}
});

const upload=multer({storage:multer.diskStorage({destination:"uploads/",filename:(_,f,cb)=>cb(null,crypto.randomUUID()+path.extname(f.originalname).toLowerCase())}),limits:{fileSize:10*1024*1024},fileFilter:(_,f,cb)=>cb(["image/jpeg","image/png","application/pdf"].includes(f.mimetype)?null:new Error("JPG, PNG o PDF"))});
app.post("/api/orders",user,upload.single("receipt"),(req,res)=>{
 const p=products.find(x=>x[0]===req.body.productKey), id=String(req.body.playerId||"");
 if(!p||!req.file||!/^\d{5,15}$/.test(id)||!req.body.playerName)return res.status(400).json({error:"Faltan datos o comprobante"});
 const publicId="YD-"+Math.floor(100000+Math.random()*900000);
 db.prepare("INSERT INTO orders(public_id,user_id,product,price,player_id,player_name,status,receipt) VALUES(?,?,?,?,?,?,?,?)").run(publicId,req.user.id,p[1],p[2],id,req.body.playerName,"AWAITING_PAYMENT",req.file.filename);
 res.json({ok:true,orderId:publicId});
});
app.get("/api/orders",user,(req,res)=>res.json(db.prepare("SELECT public_id,product,price,player_id,player_name,status,created_at FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id)));

app.get("/api/admin/orders",admin,(req,res)=>res.json(db.prepare("SELECT o.*,u.name customer,u.email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.id DESC").all()));
app.get("/api/admin/receipt/:f",admin,(req,res)=>{const f=path.basename(req.params.f),o=db.prepare("SELECT id FROM orders WHERE receipt=?").get(f);if(!o)return res.sendStatus(404);res.sendFile(path.resolve("uploads",f))});
app.post("/api/admin/orders/:id/reject",admin,(req,res)=>{db.prepare("UPDATE orders SET status='REJECTED' WHERE public_id=? AND status='AWAITING_PAYMENT'").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/orders/:id/confirm",admin,async(req,res)=>{
 const o=db.prepare("SELECT * FROM orders WHERE public_id=?").get(req.params.id);
 if(!o||o.status!=="AWAITING_PAYMENT")return res.status(409).json({error:"Pedido no pendiente"});
 const p=products.find(x=>x[1]===o.product), offer=p&&process.env[p[3]];
 if(!process.env.FAZER_API_KEY||!process.env.FAZER_CATEGORY_ID||!offer)return res.status(503).json({error:"Proveedor/oferta no configurado"});
 try{const r=await fetch(`${process.env.FAZER_BASE_URL}/topups/order`,{method:"POST",headers:{"X-API-Key":process.env.FAZER_API_KEY,"Idempotency-Key":crypto.randomUUID(),"Content-Type":"application/json"},body:JSON.stringify({category_id:process.env.FAZER_CATEGORY_ID,offer_id:offer,fields:{player_id:o.player_id}})}),d=await r.json();if(!r.ok||!d.ok){db.prepare("UPDATE orders SET status='PROVIDER_FAILED' WHERE id=?").run(o.id);return res.status(502).json({error:d.error||"Proveedor rechazó la orden"})}db.prepare("UPDATE orders SET status='SENT_TO_PROVIDER',provider_id=? WHERE id=?").run(d.order?.id||"",o.id);res.json({ok:true})}catch{db.prepare("UPDATE orders SET status='PROVIDER_FAILED' WHERE id=?").run(o.id);res.status(502).json({error:"Error con proveedor"})}
});
app.use(express.static("public")); app.listen(process.env.PORT||3000,()=>console.log("Ventas Yupi Dilan listo"));
