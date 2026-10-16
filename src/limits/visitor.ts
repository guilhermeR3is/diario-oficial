import { createHmac } from "node:crypto";

// a Vercel sobrescreve este cabeçalho com o IP de quem chamou, então o visitante não escolhe o próprio valor
export function visitorIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

// a data entra no hash para que nem quem tem o banco consiga seguir o mesmo visitante de um dia para o outro
export function hashVisitor(ip: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`${day}|${ip}`).digest("hex");
}
