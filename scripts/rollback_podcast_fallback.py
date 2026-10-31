"""Preview or apply this iteration's file-scoped rollback, preserving later edits."""
import rollback_funds_breakdown as rollback

rollback.BACKUP = rollback.ROOT / 'tmp' / 'podcast-demo-20261028-before'

if __name__ == '__main__':
    try:
        rollback.main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error
