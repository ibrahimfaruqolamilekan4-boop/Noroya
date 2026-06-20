import { useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export interface HandleErrorOptions {
  contextName?: string;         // Name of the operation where error occurs (e.g., "Add New Plan")
  fallbackMessage?: string;     // Default message when code isn't fully matched
  silent?: boolean;             // True if we don't want a toast to show up in UI
  logToConsole?: boolean;       // True if we want robust structured console diagnostic outputs
}

/**
 * A centralized, high-fidelity custom hook to catch, normalize, and report Supabase exceptions.
 * Logs specific PostgreSQL & PostgREST error codes to console with styled group displays,
 * and triggers crisp, user-friendly, non-blocking toast notifications in local Neo-Brutalist accents.
 */
export function useSupabaseError() {
  const handleSupabaseError = useCallback((error: unknown, options: HandleErrorOptions = {}) => {
    const {
      contextName = "Database Sync Service",
      fallbackMessage = "An unexpected database synchronization issue occurred. Please check your credentials.",
      silent = false,
      logToConsole = true
    } = options;

    // Safely cast error structure
    const err = error as SupabaseErrorLike;
    const errorCode = err?.code || "";
    const originalMessage = err?.message || "";
    const details = err?.details || "";
    const hint = err?.hint || "";

    // 1. Robust Diagnostic Logging to the Console
    if (logToConsole) {
      console.group(`%c🚨 [SUPABASE DATABASE ERROR] - ${contextName}`, "color: #E23E57; font-weight: 800; font-size: 11px;");
      console.error("Raw Error Object:", error);
      console.log(`%cCode:%c ${errorCode || "N/A (General Network/TypeError)"}`, "color: #FFA41B; font-weight: bold;", "");
      console.log(`%cMessage:%c ${originalMessage || "No message prompt provided"}`, "color: #FFA41B; font-weight: bold;", "");
      if (details) {
        console.log(`%cDetails:%c ${details}`, "color: #FFA41B; font-weight: bold;", "");
      }
      if (hint) {
        console.log(`%cHint:%c ${hint}`, "color: #FFA41B; font-weight: bold;", "");
      }
      console.groupEnd();
    }

    // 2. High-Fidelity Humanized Mapping of DB Error Codes
    let userFriendlyMessage = fallbackMessage;

    if (errorCode) {
      switch (errorCode) {
        // PostgreSQL Constraints & Validation
        case "23505": // Unique Constraint violation
          userFriendlyMessage = `Database Entry Conflict: This item already exists. Duplicates are not permitted.`;
          break;
        case "23503": // Foreign Key violation
          userFriendlyMessage = `Integrity Validation Failed: Referenced identifier could not be validated in parents.`;
          break;
        case "23502": // Not Null requirement violated
          userFriendlyMessage = `Form Validation Error: One or more required fields are missing values.`;
          break;
        case "42501": // Row Level Security / Unauthorized
          userFriendlyMessage = `Database Restriction: Access denied or insufficient permissions to execute this request (RLS policy active).`;
          break;
        case "42P01": // Missing table
          userFriendlyMessage = `PostgreSQL Configuration Error: The target table was not found on this database schema.`;
          break;
        case "42703": // Missing column
          userFriendlyMessage = `PostgreSQL Schema Conflict: Missing column declaration on host side.`;
          break;
        
        // PostgREST/Supabase specific codes
        case "PGRST116": // .single() query matches 0 rows
          userFriendlyMessage = `Retrieve Error: No corresponding record was found in the database.`;
          break;
        case "PGRST301": // Invalid/Expired JWT authentication token
        case "PGRST302":
          userFriendlyMessage = `Authorization Refused: Your database access token is invalid or expired. Please re-authenticate.`;
          break;

        default:
          if (originalMessage) {
            userFriendlyMessage = `${contextName} Failed: ${originalMessage}`;
          }
          break;
      }
    } else if (originalMessage) {
      const lower = originalMessage.toLowerCase();
      if (lower.includes("network") || lower.includes("load failed") || lower.includes("failed to fetch")) {
        userFriendlyMessage = `Database Connection Error: Failed resolving database URL connection. Please verify your host network configuration properties.`;
      } else {
        userFriendlyMessage = `${contextName} Failed: ${originalMessage}`;
      }
    }

    // 3. Neo-Brutalist Flat Custom Toast Trigger (Matches option C layout aesthetic perfectly)
    if (!silent) {
      toast.error(userFriendlyMessage, {
        duration: 5500,
        id: `supabase-client-error-${errorCode || originalMessage.substring(0, 24)}`, // Prevent stack overlapping spam
        style: {
          border: '2px solid #000000',
          padding: '12px 16px',
          color: '#1a1a1a',
          background: '#DBE2EF',
          fontSize: '11px',
          fontWeight: 'bold',
          borderRadius: '4px',
          boxShadow: '4px 4px 0px #000000',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }
      });
    }

    return userFriendlyMessage;
  }, []);

  return { handleSupabaseError };
}
