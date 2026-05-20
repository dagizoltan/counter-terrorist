import { ApplicationStatus } from "@core/ports.ts";

/**
 * Standard Props for UI Pages/Components
 */
export interface PageProps {
  status?: ApplicationStatus;
  csrfToken?: string;
  nonce?: string;
  hostname?: string;
  userRole?: string;
  islandPaths?: string[];
  [key: string]: any;
}

/**
 * Shared State in Hono Context for UI
 */
export interface SharedState {
  status: ApplicationStatus;
  csrfToken: string;
  nonce: string;
  hostname: string;
  userRole: string;
}
