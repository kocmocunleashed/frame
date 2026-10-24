export type CreditBalance = {
  remaining: number | null;
  revision: number;
};

export type AdminUser = CreditBalance & {
  id: string;
  name: string;
  email: string;
};

export type AdminUsers = {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
};

export type AccountCredits = CreditBalance & { isAdmin: boolean };
