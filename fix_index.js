const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set } = require('firebase/database');

const app = initializeApp({
  databaseURL: "https://kids-study-hub-default-rtdb.asia-southeast1.firebasedatabase.app"
});
const db = getDatabase(app);

async function run() {
  const usersRef = ref(db, 'users');
  const snap = await get(usersRef);
  if (snap.exists()) {
    const data = snap.val();
    for (const uid in data) {
      if (data[uid].kids) {
        for (const kidId in data[uid].kids) {
          const email = data[uid].kids[kidId].email;
          if (email) {
            const safeEmail = email.toLowerCase().replace(/\./g, ',');
            console.log(`Linking ${email} to parent ${uid} kid ${kidId}`);
            await set(ref(db, `studentLinks/${safeEmail}`), {
              parentId: uid,
              kidId: kidId
            });
          }
        }
      }
    }
  }
  console.log("Done");
  process.exit(0);
}
run();
