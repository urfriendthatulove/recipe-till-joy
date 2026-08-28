import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export function AccessDenied({
  title = "Akses Ditolak",
  message = "Akun Anda tidak memiliki izin untuk membuka halaman ini.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <AppShell title={title} description="Silakan gunakan menu yang sesuai dengan role akun Anda.">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-4">
          <Link
            to="/kasir"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali ke Kasir
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
