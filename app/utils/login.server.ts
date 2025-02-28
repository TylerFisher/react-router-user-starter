import { invariant } from "@epic-web/invariant";
import { redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import { safeRedirect } from "remix-utils/safe-redirect";
import { db } from "~/drizzle/db.server";
import { sessions, verification } from "~/drizzle/schema.server";
import { twoFAVerificationType } from "~/routes/settings/two-factor";
import { getUserId, sessionKey } from "~/utils/auth.server";
import { combineResponseInits } from "~/utils/misc";
import { authSessionStorage } from "~/utils/session.server";
import { verifySessionStorage } from "~/utils/verification.server";
import {
	type VerifyFunctionArgs,
	getRedirectToUrl,
} from "~/utils/verify.server";

const verifiedTimeKey = "verified-time";
const unverifiedSessionIdKey = "unverified-session-id";
const rememberKey = "remember";

/**
 * Handles new session creation and determines whether to request 2FA verification
 * @param param0 Parameters for new session including request, session data, redirect URL, and remember boolean
 * @param responseInit
 * @returns Redirect response for given redirect URL
 */
export async function handleNewSession(
	{
		request,
		session,
		redirectTo,
		remember,
	}: {
		request: Request;
		session: { userId: string; id: string; expirationDate: Date };
		redirectTo?: string;
		remember: boolean;
	},
	responseInit?: ResponseInit,
) {
	const existingVerification = await db.query.verification.findFirst({
		columns: { id: true },
		where: and(
			eq(verification.target, session.userId),
			eq(verification.type, twoFAVerificationType),
		),
	});
	const userHasTwoFactor = Boolean(existingVerification);

	if (userHasTwoFactor) {
		const verifySession = await verifySessionStorage.getSession();
		verifySession.set(unverifiedSessionIdKey, session.id);
		verifySession.set(rememberKey, remember);
		const redirectUrl = getRedirectToUrl({
			request,
			type: twoFAVerificationType,
			target: session.userId,
			redirectTo,
		});
		return redirect(
			`${redirectUrl.pathname}?${redirectUrl.searchParams}`,
			combineResponseInits(
				{
					headers: {
						"set-cookie":
							await verifySessionStorage.commitSession(verifySession),
					},
				},
				responseInit,
			),
		) as never;
	}
	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	authSession.set(sessionKey, session.id);

	return redirect(
		safeRedirect(redirectTo),
		combineResponseInits(
			{
				headers: {
					"set-cookie": await authSessionStorage.commitSession(authSession, {
						expires: remember ? session.expirationDate : undefined,
					}),
				},
			},
			responseInit,
		),
	);
}

/**
 * Handles verification of a session and redirects to the appropriate URL
 * @param param0 Parameters for verification including request and submission data
 * @returns Redirect response for given redirect URL
 */
export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(
		submission.status === "success",
		"Submission should be successful by now",
	);
	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get("cookie"),
	);

	const remember = verifySession.get(rememberKey);
	const { redirectTo } = submission.value;
	const headers = new Headers();
	authSession.set(verifiedTimeKey, Date.now());

	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey);
	if (unverifiedSessionId) {
		const existingSession = await db.query.sessions.findFirst({
			columns: { expirationDate: true },
			where: eq(sessions.id, unverifiedSessionId),
		});
		if (!existingSession) {
			throw redirect("/accounts/login");
		}
		authSession.set(sessionKey, unverifiedSessionId);

		headers.append(
			"set-cookie",
			await authSessionStorage.commitSession(authSession, {
				expires: remember ? existingSession.expirationDate : undefined,
			}),
		);
	} else {
		headers.append(
			"set-cookie",
			await authSessionStorage.commitSession(authSession),
		);
	}

	headers.append(
		"set-cookie",
		await verifySessionStorage.destroySession(verifySession),
	);

	return redirect(safeRedirect(redirectTo), { headers });
}

/**
 * Determines whether to request 2FA verification based on session data
 * @param request Request object
 * @returns Whether to request 2FA verification
 */
export async function shouldRequestTwoFA(request: Request) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get("cookie"),
	);
	if (verifySession.has(unverifiedSessionIdKey)) return true;
	const userId = await getUserId(request);
	if (!userId) return false;
	// if it's over two hours since they last verified, we should request 2FA again
	const userHasTwoFA = await db.query.verification.findFirst({
		columns: { id: true },
		where: and(
			eq(verification.target, userId),
			eq(verification.type, twoFAVerificationType),
		),
	});
	if (!userHasTwoFA) return false;
	const verifiedTime = authSession.get(verifiedTimeKey) ?? new Date(0);
	const twoHours = 1000 * 60 * 2;
	return Date.now() - verifiedTime > twoHours;
}
