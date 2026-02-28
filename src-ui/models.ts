// Data model declarations

// TODO Share these with /src/db/models, rather than duplicate

export interface User {
  id: number;
  username: string;
  name?: string;
  sisId?: string;
  role?: string;
}
