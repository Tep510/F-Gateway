import SignInButton from "./components/SignInButton"

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            F-Gateway
          </h1>
          <p className="text-gray-600">
            Friendslogi Data Exchange Portal
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <SignInButton />
          <p className="text-center text-sm text-gray-500 mt-4">
            Googleアカウントでサインインしてください
          </p>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Version 0.1.0</p>
          <p className="mt-1">© 2026 Friendslogi</p>
        </div>
      </div>
    </div>
  );
}
