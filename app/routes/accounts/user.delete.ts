import type { Route } from "./+types/user.delete";
import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import { db } from "~/drizzle/db.server";
import { users } from "~/drizzle/schema.server";
import { requireUserId } from "~/utils/auth.server";

export const action = async ({ request }: Route.ActionArgs) => {
	const userId = await requireUserId(request);
	await db.delete(users).where(eq(users.id, userId));
	return redirect("/");
};
