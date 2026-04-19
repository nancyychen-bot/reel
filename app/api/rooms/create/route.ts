import { createClient } from "@/lib/supabase/server";

function makeCode(): string {
  const words = ["DUNE", "ROMA", "KINO", "NOIR", "REEL", "LENS", "FILM", "FARO", "CLEO"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${word}-${num}${letter}`;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure unique code
  let code = makeCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle();
    if (!data) break;
    code = makeCode();
    attempts++;
  }

  const { data: room, error } = await supabase.from("rooms").insert({
    code,
    host_id: user.id,
    status:  "waiting",
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ code: room.code, id: room.id });
}
