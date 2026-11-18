// Misi harian dan pencapaian akun.
//
// Logikanya sekarang ada di shared/src/progress.ts, karena server memakainya juga untuk akun
// online (hasil pertandingan online dicatat server, bukan client). File ini hanya meneruskan
// nama-nama yang sama supaya impor yang sudah ada tetap berlaku.
export {
  ACHIEVEMENTS,
  achievementView,
  applyMatchToDaily,
  dailyView,
  missionById,
  missionsFor,
  todayKey,
  unlockedIds,
  type Achievement,
  type AchievementView,
  type DailyState,
  type Mission,
  type MissionView,
} from '../../../shared/src/progress';
