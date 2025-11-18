// firebase-config.js
// NO guardamos la API key aquí. Solo devolvemos la config usando la key
// almacenada en localStorage desde el navegador.

export function getFirebaseConfig() {
  const apiKey = localStorage.getItem("firebaseApiKey");

  if (!apiKey || !apiKey.trim()) {
    throw new Error("Falta la API key de Firebase en localStorage");
  }

  return {
    apiKey: apiKey.trim(),
    authDomain: "escaner-tarjetas.firebaseapp.com",
      projectId: "escaner-tarjetas",
      storageBucket: "escaner-tarjetas.firebasestorage.app",
      messagingSenderId: "879669401384",
      appId: "1:879669401384:web:33a94e2e77610120b0221d"
  };
}











