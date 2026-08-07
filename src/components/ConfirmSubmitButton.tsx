"use client";

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  disabled,
  children,
}: {
  confirmMessage: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
