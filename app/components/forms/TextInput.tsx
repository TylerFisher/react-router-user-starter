import { Box, Flex, Text, TextField } from "@radix-ui/themes";
import type React from "react";
import { useId } from "react";
import ErrorCallout from "./ErrorCallout";

interface FieldProps {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>;
	inputProps: TextField.RootProps & React.InputHTMLAttributes<HTMLInputElement>;
	errors?: ListOfErrors;
}

export type ListOfErrors = Array<string | null | undefined> | null | undefined;

const TextInput = ({ labelProps, inputProps, errors }: FieldProps) => {
	const fallbackId = useId();
	const id = inputProps.id ?? fallbackId;
  const isError = errors && errors.length > 0;
	return (
		<Box mb="5">
			<Flex mb="1">
				{/* biome-ignore lint/a11y/noLabelWithoutControl: will be used in a form elsewhere */}
				<label {...labelProps}>
					<Text size="3" weight="bold">
						{labelProps.children}
					</Text>
				</label>
			</Flex>
			<TextField.Root
				{...inputProps}
				aria-invalid={isError ? true : undefined}
				aria-describedby={isError ? `${id}-error` : undefined}
				size="3"
			>
				<TextField.Slot />
			</TextField.Root>
			{errors && errors.length > 0 && <ErrorCallout error={errors?.join(",")} />}
		</Box>
	);
};

export default TextInput;
