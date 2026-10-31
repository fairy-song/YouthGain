"""Preview or safely roll back this interaction audit, retaining earlier enhancements."""
import rollback_funds_breakdown as rollback

rollback.BACKUP = rollback.ROOT / 'tmp' / 'ux-audit-20261029-before'
if __name__ == '__main__':
    rollback.main()
