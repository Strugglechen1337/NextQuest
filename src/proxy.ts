import { NextResponse, type NextRequest } from "next/server";

/**
 * Optionaler Zugriffsschutz fürs Heimnetz: Ist APP_PASSWORD gesetzt,
 * fragt der Browser einmal nach Benutzername (beliebig) und Passwort.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Anmeldung erforderlich", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="NextQuest", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
