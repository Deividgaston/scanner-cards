// firebase-config.js
// Lee la API key desde el navegador (localStorage)
// y usa el resto de datos fijos de tu proyecto Firebase.

export function getFirebaseConfig() {
  const apiKey = localStorage.getItem("firebaseApiKey");

  if (!apiKey) {
    throw new Error(
      "No se ha encontrado la API key en el navegador. " +
      "Pulsa en 'Configurar API Key de Firebase' en la página principal."
    );
  }

  return {
    apiKey,
    // ⬇️ RELLENA ESTOS CAMPOS CON LOS DATOS DE TU PROYECTO FIREBASE
    authDomain: "escaner-tarjetas.firebaseapp.com",
  projectId: "escaner-tarjetas",
  storageBucket: "escaner-tarjetas.firebasestorage.app",
  messagingSenderId: "879669401384",
  appId: "1:879669401384:web:33a94e2e77610120b0221d",
  };
}
