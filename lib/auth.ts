import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    Credentials({
      name: "Dev Login",
      credentials: {
        role: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        if (process.env.NODE_ENV === "production") return null
        const role = (credentials?.role as string) || "client"
        return {
          id: `dev-${role}-001`,
          email: `dev-${role}@friendslogi.com`,
          name: `Dev ${role === "admin" ? "Admin" : "Client"}`,
          role,
          clientId: role === "client" ? "dev-client-001" : null,
          clientCode: role === "client" ? "DEV001" : null,
          clientName: role === "client" ? "開発用クライアント" : null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Dev credentials login
      if (account?.provider === "credentials" && user) {
        token.email = user.email
        token.name = user.name
        token.role = (user as any).role
        token.clientId = (user as any).clientId
        token.clientCode = (user as any).clientCode
        token.clientName = (user as any).clientName
        return token
      }
      // Google login
      if (account && profile) {
        token.email = profile.email
        token.name = profile.name
        const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase())
        token.role = adminEmails.includes((profile.email || "").toLowerCase()) ? "admin" : "client"
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.id = token.sub as string
        session.user.clientId = (token.clientId as string) || null
        session.user.clientCode = (token.clientCode as string) || null
        session.user.clientName = (token.clientName as string) || null
        // Re-evaluate role on every session to pick up env var changes
        if (token.clientId) {
          session.user.role = token.role as string
        } else {
          const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase())
          session.user.role = adminEmails.includes((session.user.email || "").toLowerCase()) ? "admin" : "client"
        }

        // Fetch client info from database if user has email but no clientId yet
        if (!session.user.clientId && session.user.email) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email: session.user.email },
              include: { client: true }
            })
            if (dbUser?.client) {
              session.user.clientId = String(dbUser.client.id)
              session.user.clientCode = dbUser.client.clientCode
              session.user.clientName = dbUser.client.clientName
            }
          } catch (error) {
            console.error('Failed to fetch client info:', error)
          }
        }
      }
      return session
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
})
