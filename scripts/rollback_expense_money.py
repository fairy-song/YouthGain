"""Preview or apply the spending-money visual rollback without losing later edits."""
import rollback_funds_breakdown as rollback

rollback.BACKUP = rollback.ROOT / 'tmp' / 'expense-money-20261028-before'

if __name__ == '__main__':
    try:
        rollback.main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error
