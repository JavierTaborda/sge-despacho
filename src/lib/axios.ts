// import { useAuthStore } from "@/stores/useAuthStore";
// import axios from "axios";

// const api = axios.create({
//   baseURL: process.env.EXPO_PUBLIC_API_URL,
//   timeout: 30000,
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// // Interceptor to add the token
// api.interceptors.request.use(
//   async (config) => {
//     const token = useAuthStore.getState().token;
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => Promise.reject(error)
// );

// // api.interceptors.response.use(
// //   (response) => response,
// //   (error) => {
// //     if (error.response?.status === 401) {
// //       console.warn("No autorizado. Redirigiendo al login...");
// //       // Aquí podrías limpiar el estado, redirigir, mostrar modal, etc.
// //     }

// //     return Promise.reject(error);
// //   }
// // );

// export default api;
