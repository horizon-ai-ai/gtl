export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md space-y-3">
        <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-center">
          <div className="text-sm font-semibold">Marketing AI Platform</div>
          <div className="text-xs text-neutral-500 mt-1">本地測試入口：localhost:3000</div>
        </div>
        {children}
      </div>
    </div>
  );
}
