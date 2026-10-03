import { describe, it, expect, vi } from 'vitest';
import { authenticateWithEmail } from './client';
import { SnapieAuthError } from './types';

// The email form's tab is only a hint. authenticateWithEmail decides between
// registering and signing in from the server's response, so a user never has to
// notice which tab is selected.

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

const ok = () => Promise.resolve({ pending: true });
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
    const register = vi.fn(failsWith('email_exists', 409));
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res).toEqual({ outcome: 'signedIn', user: USER, notice: 'alreadyRegistered' });
    expect(login).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('treats a 409 as "account exists" even without a recognised code', async () => {
    const register = vi.fn(failsWith('some_unmapped_code', 409));
    const login = vi.fn().mockResolvedValue(USER);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login));

    expect(res.outcome).toBe('signedIn');
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('does not fall back for unrelated registration failures', async () => {
    const register = vi.fn(failsWith('weak_password', 400));
    const login = vi.fn();

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'register', ops(register, login)),
    ).rejects.toMatchObject({ code: 'weak_password' });
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

  it('falls back to registering when no account exists', async () => {
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
    // unauthorized means either "wrong password" or "no such user". The probe
    // register proves the account exists, so this must be a sign-in failure.
    const login = vi.fn(failsWith('unauthorized', 401));
    const register = vi.fn(failsWith('email_exists', 409));

    await expect(
      authenticateWithEmail('a@b.c', 'wrong', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: 'unauthorized', accountExists: true });
  });

  it('registers when the probe proves the email was never used', async () => {
    const login = vi.fn(failsWith('invalid_credentials', 400));
    const register = vi.fn(ok);

    const res = await authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login));

    expect(res).toEqual({ outcome: 'registered', notice: 'accountCreated' });
  });

  it('reports the original login failure when the probe fails for another reason', async () => {
    const login = vi.fn(failsWith('unauthorized', 401));
    const register = vi.fn(failsWith('over_request_rate_limit', 429));

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('surfaces a probe registration error rather than a misleading login error', async () => {
    const login = vi.fn(failsWith('unauthorized', 401));
    const register = vi.fn(failsWith('weak_password', 400));

    await expect(
      authenticateWithEmail('a@b.c', 'pw', 'login', ops(register, login)),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
