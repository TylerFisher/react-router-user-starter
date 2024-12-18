import type { Route } from "./+types/onboarding";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { Box, Heading, Text } from "@radix-ui/themes";
import { data, redirect, Form, useSearchParams } from "react-router";
import { HoneypotInputs } from "remix-utils/honeypot/react";
import { safeRedirect } from "remix-utils/safe-redirect";
import { z } from "zod";
import CheckboxField from "~/components/forms/CheckboxField";
import SubmitButton from "~/components/forms/SubmitButton";
import TextInput from "~/components/forms/TextInput";
import Layout from "~/components/Layout";
import { requireAnonymous, sessionKey, signup } from "~/utils/auth.server";
import { checkHoneypot } from "~/utils/honeypot.server";
import { authSessionStorage } from "~/utils/session.server";
import {
	EmailSchema,
	NameSchema,
	PasswordAndConfirmPasswordSchema,
} from "~/utils/userValidation";
import { verifySessionStorage } from "~/utils/verification.server";

export const onboardingEmailSessionKey = "onboardingEmail";

const SignupFormSchema = z
	.object({
		email: EmailSchema,
		name: NameSchema,
		remember: z.boolean().optional(),
		redirectTo: z.string().optional(),
	})
	.and(PasswordAndConfirmPasswordSchema);

/**
 * Gets email address from onboarding session
 * @param request Request object
 * @returns Email address from onboarding session
 */
async function requireOnboardingEmail(request: Request) {
	await requireAnonymous(request);
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get("cookie"),
	);
	const email = verifySession.get(onboardingEmailSessionKey);
	if (typeof email !== "string" || !email) {
		throw redirect("/accounts/signup");
	}
	return email;
}

export async function loader({ request }: Route.LoaderArgs) {
	const email = await requireOnboardingEmail(request);
	return { email };
}

export async function action({ request }: Route.ActionArgs) {
	const email = await requireOnboardingEmail(request);
	const formData = await request.formData();
	checkHoneypot(formData);
	const submission = await parseWithZod(formData, {
		schema: (intent) =>
			SignupFormSchema.transform(async (data) => {
				if (intent !== null) return { ...data, session: null };

				const session = await signup({
					...data,
					email,
					sentPassword: data.password,
				});
				return { ...data, session };
			}),
		async: true,
	});

	if (submission.status !== "success" || !submission.value.session) {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === "error" ? 400 : 200 },
		);
	}

	const { session, remember, redirectTo } = submission.value;

	const authSession = await authSessionStorage.getSession(
		request.headers.get("cookie"),
	);
	authSession.set(sessionKey, session.id);
	const verifySession = await verifySessionStorage.getSession();
	const headers = new Headers();
	headers.append(
		"set-cookie",
		await authSessionStorage.commitSession(authSession, {
			expires: remember ? session.expirationDate : undefined,
		}),
	);
	headers.append(
		"set-cookie",
		await verifySessionStorage.destroySession(verifySession),
	);

	return redirect(safeRedirect(redirectTo), { headers }) as never;
}

export const meta: Route.MetaFunction = () => {
	return [{ title: "Setup your account" }];
};

export default function OnboardingRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { email } = loaderData;
	const [searchParams] = useSearchParams();
	const redirectTo =
		searchParams.get("redirectTo") || "/";

	const [form, fields] = useForm({
		id: "onboarding-form",
		constraint: getZodConstraint(SignupFormSchema),
		defaultValue: { redirectTo },
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SignupFormSchema });
		},
		shouldRevalidate: "onBlur",
	});

	return (
		<Layout>
			<Box mb="5">
				<Heading size="8">Welcome</Heading>
				<Text as="p">Please enter your account details.</Text>
			</Box>
			<Form method="post" {...getFormProps(form)}>
				<HoneypotInputs />
				<TextInput
					labelProps={{
						htmlFor: fields.email.name,
						children: "Email",
					}}
					inputProps={{
						...getInputProps(fields.email, { type: "email" }),
						readOnly: true,
						value: email,
					}}
					errors={fields.email.errors}
				/>
				<TextInput
					labelProps={{
						htmlFor: fields.name.name,
						children: "Name",
					}}
					inputProps={{
						...getInputProps(fields.name, { type: "text" }),
					}}
					errors={fields.name.errors}
				/>
				<TextInput
					labelProps={{
						htmlFor: fields.password.name,
						children: "Password",
					}}
					inputProps={{
						...getInputProps(fields.password, { type: "password" }),
					}}
					errors={fields.password.errors}
				/>
				<TextInput
					labelProps={{
						htmlFor: fields.confirmPassword.name,
						children: "Confirm password",
					}}
					inputProps={{
						...getInputProps(fields.confirmPassword, { type: "password" }),
					}}
					errors={fields.confirmPassword.errors}
				/>

				<Box mb="5">
					<CheckboxField
						labelProps={{
							htmlFor: fields.remember.name,
							children: "Remember me?",
						}}
						inputProps={{
							id: fields.remember.id,
							name: fields.remember.name,
						}}
						errors={fields.remember.errors}
					/>
				</Box>

				<input {...getInputProps(fields.redirectTo, { type: "hidden" })} />

				<div className="flex items-center justify-between gap-6">
					<SubmitButton label="Create an account" />
				</div>
			</Form>
		</Layout>
	);
}
