// reset-admin.js
//
// Paano gamitin (sa Render Shell tab ng BACKEND service, hindi sa sarili mong
// computer — dapat parehong disk/environment kung saan tumatakbo ang server,
// para sigurado tamang citydental.db file ang naaabot):
//
//   1. I-upload/i-commit ang file na ito sa ROOT ng backend repo (kasabay
//      ng db.js at ng routes/ folder), tapos i-deploy.
//   2. Sa Render, buksan ang "Shell" tab ng backend service.
//   3. Patakbuhin:
//        node reset-admin.js admin@citydental.gov.ph BagongPassword123!
//
//      Kung walang laman ang 2nd/3rd argument, gagamitin ang mga default sa
//      baba. Pwede mo ring baguhin ang EMAIL/PASSWORD dito nang direkta.
//
// Ginagawa nito:
//   - Kung meron nang user na may ganitong email -> ina-update lang ang
//     password_hash niya (kahit anong role — admin, doctor, patient).
//   - Kung wala pang ganitong email -> gagawa ng BAGONG 'admin' account.
//
// PAALALA: Palitan agad ang password na ito pagkatapos makapag-login
// (Settings & privacy -> Change password), lalo na kung na-type mo ito sa
// isang shared/terminal na makikita ng iba.

import bcrypt from "bcryptjs";
import db from "./db.js";

const EMAIL = process.argv[2] || "admin@citydental.gov.ph";
const NEW_PASSWORD = process.argv[3] || "ChangeMe123!";

if (NEW_PASSWORD.length < 8) {
  console.error("Error: kailangan ng hindi bababa sa 8 characters ang password.");
  process.exit(1);
}

const hash = bcrypt.hashSync(NEW_PASSWORD, 10);

const existing = db.prepare("SELECT id, role, email FROM users WHERE email = ?").get(EMAIL);

if (existing) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, existing.id);
  console.log(`✔ Na-update ang password para sa user #${existing.id} (${existing.role}, ${existing.email}).`);
} else {
  const info = db
    .prepare(
      `INSERT INTO users (role, name, email, password_hash)
       VALUES ('admin', ?, ?, ?)`
    )
    .run("Admin", EMAIL, hash);
  console.log(`✔ Gumawa ng bagong admin account #${info.lastInsertRowid} (${EMAIL}).`);
}

console.log("");
console.log("Email:   ", EMAIL);
console.log("Password:", NEW_PASSWORD);
console.log("");
console.log("Subukan mo nang mag-login, tapos agad na palitan ang password sa Settings & privacy.");