import type { ButtonHTMLAttributes } from "react";

export function Button({
  variant: _variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return <button {...props} />;
}
export function Spinner() {
  return <span aria-hidden="true">◌</span>;
}
