import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  hint,
  id,
  ...input
}: { label: string; hint?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-11 w-full rounded-card border border-border-strong bg-surface px-4 text-[15px] placeholder:text-fg-subtle"
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PrimaryButton({ children, disabled, ...rest }: { children: ReactNode; disabled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      className="h-11 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent disabled:active:scale-100"
      {...rest}
    >
      {children}
    </button>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card bg-bg-subtle px-4 py-3 text-[14px] text-danger">
      {children}
    </p>
  );
}
