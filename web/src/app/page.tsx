import { redirect } from "next/navigation";

export default function Home() {
  // Неавторизованных сюда пускает только proxy.ts после гейта — редиректит
  // на /login раньше, чем этот рендер вообще случится.
  redirect("/teams");
}
