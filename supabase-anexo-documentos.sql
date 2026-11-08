-- ═══════════════════════════════════════════════════════════════
--  SUPORTE MEGA – Anexo de documentos nos chamados
--  Execute depois de supabase-permissoes-admin-midia.sql (pode ser executado mais de uma vez)
--
--  • Libera PDF, Word, Excel, TXT e CSV no bucket privado chamados-imagens
--  • Mantém fotos e vídeos; as políticas de acesso continuam as mesmas
--    (o dono vê os próprios anexos; administradores veem todos)
--  • Documentos até 10 MB são conferidos no site; o limite do bucket segue 50 MB
-- ═══════════════════════════════════════════════════════════════

update storage.buckets
set allowed_mime_types = array[
  -- fotos
  'image/jpeg','image/png','image/gif','image/webp',
  -- vídeos
  'video/mp4','video/webm','video/quicktime',
  -- documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
]
where id = 'chamados-imagens';

-- Conferência
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'chamados-imagens';
