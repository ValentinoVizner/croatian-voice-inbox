import { handleCreateItemRequest, handleUpdateItemRequest } from "@/lib/item-api";
import { parseCroatianNote } from "@/lib/parser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  return handleCreateItemRequest(request, {
    async getUserId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      return user?.id ?? null;
    },
    parseNote: parseCroatianNote,
    async insertItem(payload) {
      const { data, error } = await supabase.from("items").insert(payload).select().single();

      if (error) {
        throw error;
      }

      return data;
    },
  });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Could not load items." }, { status: 500 });
  }

  return Response.json(data);
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();

  return handleUpdateItemRequest(request, {
    async getUserId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      return user?.id ?? null;
    },
    async updateItem(userId, itemId, patch) {
      const { data, error } = await supabase
        .from("items")
        .update(patch)
        .eq("id", itemId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  });
}
