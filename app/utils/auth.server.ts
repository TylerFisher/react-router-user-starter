import { redirect } from "react-router";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { safeRedirect } from "remix-utils/safe-redirect";
import { uuidv7 } from "uuidv7-js";
import { db } from "~/drizzle/db.server";
import { passwords, sessions, users } from "~/drizzle/schema.server";
import { authSessionStorage } from "~/utils/session.server";
import { combineHeaders } from "./misc";

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30;
export const getSessionExpirationDate = () =>
	new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const sessionKey = "sessionId";

/**
 * Fetches the user ID from the session cookie, or redirects to the home page
 * @param request Request object
 * @returns User ID from session
 */
export async function getUserId(request: Request) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	const sessionId = await authSession.get(sessionKey);
	if (!sessionId) return null;
	const existingSession = await db.query.sessions.findFirst({
		columns: {userId: true},
		with: {
			user: {
				columns: { id: true },
			},
		},
		where: and(
			eq(sessions.id, sessionId),
			gt(sessions.expirationDate, new Date()),
		),
	});

	if (!existingSession?.user) {
		throw redirect("/", {
			headers: {
				"set-cookie": await authSessionStorage.destroySession(authSession),
			},
		});
	}
	return existingSession.user.id;
}

/**
 * Gets the user ID from the session, or redirects to the login page
 * @param request Request object
 * @param redirectTo URL to redirect to after login if user is not logged in
 * @returns User ID from session
 */
export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request);
	if (!userId) {
		const requestUrl = new URL(request.url);
		redirectTo =
			redirectTo === null
				? null
				: (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`);
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null;
		const loginRedirect = ["/accounts/login", loginParams?.toString()]
			.filter(Boolean)
			.join("?");
		throw redirect(loginRedirect);
	}
	return userId;
}

/**
 * Ensures that the user is not logged in, otherwise redirects to the home page
 * @param request Request object
 */
export async function requireAnonymous(request: Request) {
	const userId = await getUserId(request);
	if (userId) {
		throw redirect("/");
	}
}

/**
 * Handles the logout process by deleting the session from the database and the user's browser
 * @param param0 Object with request and optional redirectTo URL
 * @param responseInit ResponseInit object
 * @returns Redirect response to the given URL
 */
export async function logout(
	{
		request,
		redirectTo = "/",
	}: {
		request: Request;
		redirectTo?: string;
	},
	responseInit?: ResponseInit,
) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	const sessionId = authSession.get(sessionKey);
	// if this fails, we still need to delete the session from the user's browser
	// and it doesn't do any harm staying in the db anyway.
	if (sessionId) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
	}
	return redirect(safeRedirect(redirectTo), {
		...responseInit,
		headers: combineHeaders(
			{ "set-cookie": await authSessionStorage.destroySession(authSession) },
			responseInit?.headers,
		),
	});
}

/**
 * Handles the login process by verifying the user's credentials and creating a new session
 * @param param0 Object with email and password
 * @returns New session object
 */
export async function login({
	email,
	password,
}: {
	email: string;
	password: string;
}) {
	const user = await verifyUserPassword({ email }, password);
	if (!user) return null;
	const newSession = await db
		.insert(sessions)
		.values({
			id: uuidv7(),
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		})
		.returning({
			id: sessions.id,
			expirationDate: sessions.expirationDate,
			userId: sessions.userId,
		});
	return newSession[0];
}

/**
 * Handles the signup process by creating a new user, hashing the password, and returning a new session
 * @param param0 Object with email, password, and name
 * @returns New session object
 */
export async function signup({
	email,
	sentPassword,
	name,
}: {
	email: string;
	name: string;
	sentPassword: string;
}) {
	const hashedPassword = await getPasswordHash(sentPassword);

	const transaction = await db.transaction(async (tx) => {
		const result = await tx
			.insert(users)
			.values({
				id: uuidv7(),
				email: email.toLowerCase(),
				name,
				emailConfirmed: true,
			})
			.returning({
				id: users.id,
			});

		await tx.insert(passwords).values({
			hash: hashedPassword,
			userId: result[0].id,
		});

		const newSession = await tx
			.insert(sessions)
			.values({
				id: uuidv7(),
				expirationDate: getSessionExpirationDate(),
				userId: result[0].id,
			})
			.returning({
				id: sessions.id,
				expirationDate: sessions.expirationDate,
				userId: sessions.userId,
			});

		return {
			session: newSession[0],
		};
	});

	return transaction.session;
}

/**
 * Hashes a plaintext password
 * @param password Plaintext password
 * @returns Hashed password
 */
export async function getPasswordHash(password: string) {
	const hash = await bcrypt.hash(password, 10);
	return hash;
}

/**
 * Verifies a user's password by checking the stored hash against the plaintext password
 * @param userInfo Either email or userId
 * @param password Plaintext password
 * @returns User ID if the password is valid, otherwise null
 */
export async function verifyUserPassword(
	userInfo: { email?: string | undefined; userId?: string },
	password: string,
) {
	let where = null;
	if (userInfo.email) {
		where = eq(users.email, userInfo.email);
	}
	if (userInfo.userId) {
		where = eq(users.id, userInfo.userId);
	}

	if (!where) {
		return null;
	}

	const userWithPassword = await db.query.users.findFirst({
		where: where,
		columns: { id: true },
		with: {
			password: {
				columns: {
					hash: true,
				},
			},
		},
	});

	if (!userWithPassword || !userWithPassword.password) {
		return null;
	}

	const isValid = await bcrypt.compare(
		password,
		userWithPassword.password.hash,
	);

	if (!isValid) {
		return null;
	}

	return { id: userWithPassword.id };
}

/**
 * Resets a user's password by updating the stored hash
 * @param param0 Object with user ID and new password
 * @returns Updated password object
 */
export async function resetUserPassword({
	userId,
	newPassword,
}: {
	userId: string;
	newPassword: string;
}) {
	const hashedPassword = await getPasswordHash(newPassword);
	return await db
		.update(passwords)
		.set({
			hash: hashedPassword,
		})
		.where(eq(passwords.userId, userId));
}
