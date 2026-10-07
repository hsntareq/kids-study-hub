const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set } = require('firebase/database');

const firebaseConfig = {
  databaseURL: "https://kids-study-hub-default-rtdb.asia-southeast1.firebasedatabase.app" // Let's check env vars
};
