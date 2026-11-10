// Общий каркас BFF-роутов колокольчика: клиентский JS не видит access-токен
// (httpOnly-кука), поэтому ходит в FastAPI только через same-origin Route Handler.

import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

export async function proxy(call: (token: string) => Promise<unknown>, okStatus = 200) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
  }
  try {
    const data = await call(token);
    return okStatus === 204 ? new NextResponse(null, { status: 204 }) : NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    throw err;
  }
}
