import { useClerk, UserButton } from "@clerk/react";

export default function AccountSecurity({
  email,
  externalAccountUrl,
}: {
  email: string;
  externalAccountUrl?: string;
}) {
  if (externalAccountUrl)
    return (
      <section className="account-security" aria-label="Account security">
        <h3>Sign-in & security</h3>
        <p>Your sign-in is managed by your erxes workspace.</p>
        <a
          className="button"
          href={externalAccountUrl}
          target="_blank"
          rel="noreferrer"
        >
          Manage your erxes account
        </a>
      </section>
    );
  return <ClerkAccountSecurity email={email} />;
}

function ClerkAccountSecurity({ email }: { email: string }) {
  const clerk = useClerk();
  return (
    <section className="account-security" aria-label="Account security">
      <h3>Sign-in & security</h3>
      <p>{email}</p>
      <div className="account-security-actions">
        <UserButton />
        <button
          type="button"
          className="button"
          onClick={() => clerk.openUserProfile()}
        >
          Manage sign-in methods & security
        </button>
      </div>
    </section>
  );
}
