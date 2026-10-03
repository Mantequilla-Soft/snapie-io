import { describe, it, expect, vi } from 'vitest';
import { authenticateWithEmail } from './client';
import { SnapieAuthError } from './types';

// The email form's tab is only a hint. authenticateWithEmail decides between
// registering and signing in from the server's response, so a user never has to
// notice which tab is selected.
//
// Statuses/codes below mirror menobass/snapie-auth src/routes/auth.js exactly:
// register -> 202 pending | 409 email_already_registered | 409 login_to_claim_hive
// login   -> 200 | 401 invalid_credentials | 403 email_not_verified

const USER = {
  id: 'u1',
  name: 'tester',
  picture: null,
  hiveUsername: 'tester',
  custodyMode: 'custodial',
  isAdmin: false,
} as never;

function ops(register: unknown, login: unknown) {
  return { register: register as never, login: login as never };
}

const ok = () => Promise.resolve({ pending: true }); // 202
const ALREADY = 'email_already_registered';
const NO_HIVE = 'login_to_claim_hive';
const BAD_CREDENTIALS = 'invalid_credentials';
const failsWith = (code: string, status = 400) =>
  () => Promise.reject(new SnapieAuthError(code, status));

describe('authenticateWithEmail — register tab', () => {
  it('registers a new account without attempting a login', async () => {
    const register = vi.fn(ok);
    const login = vi.fn();

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res).toEqual({ outcome: 'registered' });
    expect(register).toHaveBeenCalledWith('a@b.c', 'pw');
    expect(login).not.toHaveBeenCalled();
  });

  it('falls back to signing in when the account already exists', async () => {
    const register = vi.fn(failsWith(ALREADY, 409));
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res).toEqual({ outcome: 'signedIn', user: USER, notice: 'alreadyRegistered' });
    expect(login).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('signs in for login_to_claim_hive (verified account, no Hive username yet)', async () => {
    const register = vi.fn(failsWith(NO_HIVE, 409));
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res).toEqual({ outcome: 'signedIn', user: USER, notice: 'alreadyRegistered' });
    expect(login).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('treats any 409 as "account exists" even without a recognised code', async () => {
    const register = vi.fn(failsWith('some_unmapped_code', 409));
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res.outcome).toBe('signedIn');
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('does not fall back for unrelated registration failures', async () => {
    const register = vi.fn(failsWith('password_too_short', 400));
    const login = vi.fn();

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login)),
    ).rejects.toMatchObject({ code: 'password_too_short' });
    expect(login).not.toHaveBeenCalled();
  });
});

describe('authenticateWithEmail — login tab', () => {
  it('signs in without attempting a registration', async () => {
    const register = vi.fn();
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login));

    expect(res).toEqual({ outcome: 'signedIn', user: USER });
    expect(register).not.toHaveBeenCalled();
  });

  it('falls back to registering when the server reports no such account', async () => {
    const register = vi.fn(ok);
    const login = vi.fn(failsWith('user_not_found', 404));

    const res = await authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login));

    expect(res).toEqual({ outcome: 'registered', notice: 'accountCreated' });
    expect(register).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('never falls back on email_not_verified', async () => {
    const register = vi.fn();
    const login = vi.fn(failsWith('email_not_verified', 403));

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: 'email_not_verified' });
    expect(register).not.toHaveBeenCalled();
  });
});

describe('authenticateWithEmail — ambiguous credential failures', () => {
  it('rejects a wrong password without creating a duplicate account', async () => {
    // 401 invalid_credentials means either "wrong password" or "no such user".
    // The probe register proves the account exists, so this must be a sign-in
    // failure and the accountExists flag lets the UI move to the Sign In tab.
    const login = vi.fn(failsWith(BAD_CREDENTIALS, 401));
    const register = vi.fn(failsWith(ALREADY, 409));

    await expect(
      authenticateWithEmail('a@b.c', 'wrong', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: 'unauthorized', accountExists: true });
  });

  it('registers when the probe proves the email was never used', async () => {
    const login = vi.fn(failsWith(BAD_CREDENTIALS, 401));
    const register = vi.fn(ok);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login));

    // 202 is ambiguous server-side (new account vs. resend to an unverified one),
    // so we claim no notice — the verification screen explains it either way.
    expect(res).toEqual({ outcome: 'registered' });
  });

  it('reports the original login failure when the probe fails for another reason', async () => {
    const login = vi.fn(failsWith(BAD_CREDENTIALS, 401));
    const register = vi.fn(failsWith('over_request_rate_limit', 429));

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: BAD_CREDENTIALS });
  });

  it('surfaces a probe validation error rather than a misleading login error', async () => {
    const login = vi.fn(failsWith(BAD_CREDENTIALS, 401));
    const register = vi.fn(failsWith('password_too_short', 400));

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: BAD_CREDENTIALS });
  });

  it('routes a never-used email on the Sign In tab to registration (202 pending)', async () => {
    // The server's 202 covers both "brand new" and "existing but unverified" —
    // it resends the mail rather than confirming the account exists. Both land
    // on the verification screen, so no notice is claimed.
    const login = vi.fn(failsWith(BAD_CREDENTIALS, 401));
    const register = vi.fn(ok);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login));

    expect(res).toEqual({ outcome: 'registered' });
    expect(register).toHaveBeenCalledWith('a@b.c', 'pw');
    expect(login).toHaveBeenCalledTimes(1);
  });
});
