import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Textarea } from '../../components/ui/textarea';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { setupApi } from '../../lib/api';
import { Copy, Check, KeyRound, Upload } from 'lucide-react';
import type { SetupData } from './SetupWizard';

interface Props {
  data: SetupData;
  updateData: (partial: Partial<SetupData>) => void;
  next: () => void;
}

export default function WalletStep({ updateData, next }: Props) {
  const [mode, setMode] = useState<'choice' | 'generate' | 'import'>('choice');
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await setupApi.generateWallet();
      setMnemonic(result.mnemonic);
      updateData({
        ownerAddress: result.ownerAddress,
        nodeAddress: result.nodeAddress,
      });
      setMode('generate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const walletJson = JSON.parse(importJson);
      const result = await setupApi.importWallet(walletJson);
      updateData({
        ownerAddress: result.ownerAddress,
        nodeAddress: result.nodeAddress,
      });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid wallet JSON');
    } finally {
      setLoading(false);
    }
  };

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (mode === 'choice') {
    return (
      <div className="space-y-4">
        <Card
          className="cursor-pointer transition-colors hover:border-ton-blue"
          onClick={handleGenerate}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <KeyRound size={20} className="text-ton-blue" />
              Generate New Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Create a new wallet with a fresh seed phrase. You will need to fund it with TON.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-ton-blue"
          onClick={() => setMode('import')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Upload size={20} className="text-ton-blue" />
              Import Existing Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              Paste your existing wallet JSON file contents.
            </p>
          </CardContent>
        </Card>

        {loading && <p className="text-sm text-zinc-400">Generating wallet...</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (mode === 'generate') {
    return (
      <div className="space-y-6">
        <Alert variant="warning">
          <AlertDescription>
            Save this seed phrase securely. It will NOT be shown again.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-2">
              {mnemonic.map((word, i) => (
                <div
                  key={i}
                  className="rounded bg-zinc-800 px-2 py-1.5 text-center text-sm"
                >
                  <span className="text-zinc-500">{i + 1}.</span> {word}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={copyMnemonic}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Seed Phrase'}
            </Button>
          </CardContent>
        </Card>

        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded"
          />
          I have saved my seed phrase securely
        </label>

        <Button
          className="w-full"
          disabled={!confirmed}
          onClick={() => {
            setMnemonic([]); // Clear from memory
            next();
          }}
        >
          Continue
        </Button>
      </div>
    );
  }

  // Import mode
  return (
    <div className="space-y-4">
      <Textarea
        placeholder="Paste wallet JSON contents..."
        value={importJson}
        onChange={(e) => setImportJson(e.target.value)}
        rows={10}
        className="font-mono text-xs"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setMode('choice')}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={handleImport}
          disabled={!importJson.trim() || loading}
        >
          {loading ? 'Importing...' : 'Import Wallet'}
        </Button>
      </div>
    </div>
  );
}
