// Server-only: адрес бэкенда не должен попасть в клиентский бандл — BFF (веб-браузер
// никогда не ходит в FastAPI напрямую, только через Next.js сервер), поэтому без
// префикса NEXT_PUBLIC_.
export const API_URL = process.env.API_URL ?? "http://localhost:8000";

export const IS_PROD = process.env.NODE_ENV === "production";
