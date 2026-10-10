import { API_URL } from '../config';

export type Profile = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  updatedAt: string;
};

export class ProfileSaveError extends Error {
  suggestion: string | null;

  constructor(message: string, suggestion: string | null = null) {
    super(message);
    this.name = 'ProfileSaveError';
    this.suggestion = suggestion;
  }
}

const profileUrl = (profile: Profile): Profile => ({
  ...profile,
  avatarUrl: profile.avatarUrl ? new URL(profile.avatarUrl, API_URL).toString() : null,
});

export const fetchProfile = async (userId: string): Promise<Profile | null> => {
  const response = await fetch(`${API_URL}/api/profiles/${encodeURIComponent(userId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load your profile. Please try again.');
  return profileUrl(await response.json() as Profile);
};

export const saveProfile = async ({
  userId,
  displayName,
  color,
  avatarData,
}: {
  userId: string;
  displayName: string;
  color: string;
  avatarData?: string | null;
}): Promise<Profile> => {
  const response = await fetch(`${API_URL}/api/profiles/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName,
      color,
      ...(avatarData === undefined ? {} : { avatarData }),
    }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result &&
      typeof result.error === 'string'
      ? result.error
      : 'Could not save your profile. Please try again.';
    const suggestion = result && typeof result === 'object' && 'suggestion' in result &&
      typeof result.suggestion === 'string'
      ? result.suggestion
      : null;
    throw new ProfileSaveError(error, suggestion);
  }
  return profileUrl(result as Profile);
};
