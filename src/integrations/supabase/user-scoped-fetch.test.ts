import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyUserScopedHeaders,
  classifyAuthorization,
} from "./user-scoped-fetch.ts";

const publishable = "sb_publishable_testkey";
const userJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig";

function incoming(authorization: string | null): Headers {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return headers;
}

describe("user-scoped PostgREST fetch headers", () => {
  it("GET table and POST RPC see the same stripped publishable Bearer today", () => {
    const getOut = applyUserScopedHeaders({
      supabaseKey: publishable,
      userAccessToken: null,
      incoming: incoming(`Bearer ${publishable}`),
    });
    const postOut = applyUserScopedHeaders({
      supabaseKey: publishable,
      userAccessToken: null,
      incoming: incoming(`Bearer ${publishable}`),
    });
    assert.equal(classifyAuthorization(getOut.get("Authorization"), publishable), "absent");
    assert.equal(classifyAuthorization(postOut.get("Authorization"), publishable), "absent");
    assert.equal(getOut.get("apikey"), publishable);
    assert.equal(postOut.get("apikey"), publishable);
  });

  it("pins the user JWT on both table GET and RPC POST after publishable Bearer is dropped", () => {
    const getOut = applyUserScopedHeaders({
      supabaseKey: publishable,
      userAccessToken: userJwt,
      incoming: incoming(`Bearer ${publishable}`),
    });
    const postOut = applyUserScopedHeaders({
      supabaseKey: publishable,
      userAccessToken: userJwt,
      incoming: incoming(`Bearer ${publishable}`),
    });
    assert.equal(classifyAuthorization(getOut.get("Authorization"), publishable), "user-jwt");
    assert.equal(classifyAuthorization(postOut.get("Authorization"), publishable), "user-jwt");
    assert.equal(getOut.get("Authorization"), `Bearer ${userJwt}`);
    assert.equal(postOut.get("Authorization"), `Bearer ${userJwt}`);
  });

  it("does not treat a user JWT as the publishable key", () => {
    const out = applyUserScopedHeaders({
      supabaseKey: publishable,
      userAccessToken: null,
      incoming: incoming(`Bearer ${userJwt}`),
    });
    assert.equal(classifyAuthorization(out.get("Authorization"), publishable), "user-jwt");
  });
});
