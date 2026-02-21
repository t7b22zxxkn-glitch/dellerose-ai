export type AuthFormState = {
  status: "idle" | "success" | "error"
  message: string
}

export const authInitialState: AuthFormState = {
  status: "idle",
  message: "",
}
