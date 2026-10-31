export type ProfileTab = 'overview' | 'battles' | 'achievements' | 'skills' | 'portfolio' | 'about';

export const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'battles', label: 'Battle History' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'skills', label: 'Trading Skills' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'about', label: 'About' },
];
