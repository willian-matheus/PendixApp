import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { PendixAssinaturaPagamento, formatarValor } from './assinatura';

export interface ComprovanteDados {
  pagamento: PendixAssinaturaPagamento;
  usuarioNome?: string;
  usuarioEmail?: string;
  escritorioNome?: string;
}

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}

export function gerarHtmlComprovante(dados: ComprovanteDados): string {
  const { pagamento, usuarioNome, usuarioEmail, escritorioNome } = dados;
  const metodoFormatado = (() => {
    const m = pagamento.payload?.metodo;
    if (m === 'cartao') return 'Cartão de Crédito';
    if (m === 'pix') return 'Pix';
    if (m === 'boleto') return 'Boleto Bancário';
    return 'Mercado Pago';
  })();

  const statusLabel = pagamento.status === 'approved' ? 'PAGAMENTO CONFIRMADO' : pagamento.status.toUpperCase();
  const statusColor = pagamento.status === 'approved' ? '#10b981' : '#f59e0b';
  const dataFormatada = formatarDataHora(pagamento.pago_em ?? pagamento.created_at);
  const valor = formatarValor(pagamento.valor_centavos);
  const planoNome = pagamento.payload?.plano_nome || 'Assinatura Pendix';
  const txId = pagamento.mp_payment_id || pagamento.id;
  const cliente = usuarioNome || escritorioNome || 'Assinante Pendix';
  const email = usuarioEmail || '—';
  const agora = formatarDataHora(new Date().toISOString());

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Comprovante de Pagamento - Pendix</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #1f2937;
      padding: 36px 32px;
      max-width: 600px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .logo-container { display: flex; align-items: center; gap: 8px; }
    .logo-icon {
      width: 32px;
      height: 32px;
      background: #7c3aed;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 900;
      font-size: 18px;
    }
    .logo-text { font-size: 22px; font-weight: 900; color: #111827; letter-spacing: -0.5px; }
    .logo-text span { color: #7c3aed; }
    .receipt-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6b7280;
      text-align: right;
    }
    .badge {
      display: inline-block;
      margin-top: 4px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      background: ${statusColor}15;
      color: ${statusColor};
      border: 1px solid ${statusColor}40;
    }
    .hero-amount {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .hero-label { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .hero-value { font-size: 32px; font-weight: 900; color: #7c3aed; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .details-table tr { border-bottom: 1px solid #f3f4f6; }
    .details-table td { padding: 12px 6px; font-size: 13px; }
    .details-table .label { color: #6b7280; font-weight: 500; width: 45%; }
    .details-table .value { color: #111827; font-weight: 700; text-align: right; }
    .auth-box {
      background: #f3f4f6;
      border-radius: 12px;
      padding: 14px;
      font-size: 11px;
      color: #4b5563;
      margin-bottom: 24px;
    }
    .auth-title { font-weight: 700; color: #374151; margin-bottom: 4px; }
    .auth-code { font-family: monospace; font-size: 11px; word-break: break-all; color: #6b7280; }
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 16px;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-container">
      <div class="logo-icon">P</div>
      <div class="logo-text">Pendi<span>x</span></div>
    </div>
    <div>
      <div class="receipt-title">Comprovante de Pagamento</div>
      <div class="badge">${statusLabel}</div>
    </div>
  </div>

  <div class="hero-amount">
    <div class="hero-label">Valor Total Pago</div>
    <div class="hero-value">${valor}</div>
  </div>

  <table class="details-table">
    <tr>
      <td class="label">Serviço / Plano</td>
      <td class="value">${planoNome}</td>
    </tr>
    <tr>
      <td class="label">Forma de Pagamento</td>
      <td class="value">${metodoFormatado}</td>
    </tr>
    <tr>
      <td class="label">Data e Hora</td>
      <td class="value">${dataFormatada}</td>
    </tr>
    <tr>
      <td class="label">ID da Transação (Mercado Pago)</td>
      <td class="value" style="font-family: monospace; font-size: 12px;">#${txId}</td>
    </tr>
    <tr>
      <td class="label">Titular / Cliente</td>
      <td class="value">${cliente}</td>
    </tr>
    <tr>
      <td class="label">E-mail Cadastrado</td>
      <td class="value">${email}</td>
    </tr>
  </table>

  <div class="auth-box">
    <div class="auth-title">Autenticação Digital</div>
    <div class="auth-code">PDX-TX-${txId}-${Date.now().toString(36).toUpperCase()}</div>
  </div>

  <div class="footer">
    Comprovante emitido eletronicamente em ${agora}.<br>
    Pendix Plataforma de Gestão — Todos os direitos reservados.
  </div>
</body>
</html>
  `.trim();
}

/**
 * Gera o arquivo PDF e aciona o compartilhamento/download nativo do Android/iOS.
 */
export async function baixarComprovantePdf(dados: ComprovanteDados): Promise<string> {
  const html = gerarHtmlComprovante(dados);
  const { uri, base64 } = await Print.printToFileAsync({
    html,
    base64: true,
  });

  const txId = (dados.pagamento.mp_payment_id || dados.pagamento.id || 'comprovante').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  let shareUri = uri;

  if (targetDir && base64) {
    const safeTarget = `${targetDir}comprovante_${txId}.pdf`;
    try {
      await FileSystem.writeAsStringAsync(safeTarget, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      shareUri = safeTarget;
    } catch (writeErr) {
      console.warn('[baixarComprovantePdf] Could not write to targetDir:', writeErr);
    }
  }

  const disponivel = await Sharing.isAvailableAsync();
  if (disponivel) {
    try {
      await Sharing.shareAsync(shareUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Comprovante Pendix - ${dados.pagamento.mp_payment_id}`,
      });
    } catch (shareErr) {
      console.warn('[baixarComprovantePdf] shareAsync error, falling back to Print.printAsync:', shareErr);
      await Print.printAsync({ html });
    }
  } else {
    await Print.printAsync({ html });
  }

  return shareUri;
}
