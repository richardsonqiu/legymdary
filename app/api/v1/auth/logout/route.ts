import type { LogoutResponse } from "@legymdary/shared";
import { withAuth } from "@/lib/api-auth";
import { revokeApiToken } from "@/lib/api-token";

/** Revokes the token used for this request. */
export const POST = withAuth(async (_request, { tokenId }) => {
  await revokeApiToken(tokenId);
  const body: LogoutResponse = { ok: true };
  return Response.json(body);
});
