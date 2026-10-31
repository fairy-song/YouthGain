"""Preview/apply only this iteration's code rollback; keep knowledge versions and user data."""
import rollback_funds_breakdown as rollback
rollback.BACKUP = rollback.ROOT / 'tmp' / 'knowledge-updates-20261029-before'
if __name__ == '__main__':
    try:
        rollback.main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error
