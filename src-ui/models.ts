// Data model declarations

// TODO Share these with /src/db/models, rather than duplicate

export interface PaginatedResponse<T> {
  per_page: number;
  offset: number;
  total_count?: number;
  data: T[];
}

export enum UserRole {
  ADMIN = "admin",
  MEMBER = "member",
}

export interface User {
  id: number;
  username: string;
  name?: string;
  sisId?: string;
  role?: UserRole;
}

