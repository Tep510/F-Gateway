import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import type { Adapter } from "@auth/core/adapters"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
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
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach user ID and role to session
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          include: { client: true },
        })

        if (dbUser) {
          session.user.id = dbUser.id.toString()
          session.user.role = dbUser.role
          session.user.clientId = dbUser.clientId?.toString() || null
          session.user.clientCode = dbUser.client?.clientCode || null
        }
      }
      return session
    },
    async signIn({ user, account, profile }) {
      if (!user.email) return false

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      })

      // If user doesn't exist, create with default role
      if (!existingUser) {
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name || null,
            role: "client",
            status: "active",
          },
        })
      }

      return true
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "database",
  },
})
