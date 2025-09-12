import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Plus, Trash2, Clock, Coins, AlertCircle, CheckCircle } from 'lucide-react';
import { formatEther, parseEther, isAddress } from 'viem';
import { CDPWalletHook, CreateSpendPermissionParams } from '../types/cdpWallet';
import { toast } from 'react-hot-toast';

interface SpendPermissionsManagerProps {
  cdpWallet: CDPWalletHook;
}

const TOKEN_OPTIONS = [
  { value: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', label: 'ETH (Native)', symbol: 'ETH' },
  { value: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', label: 'USDC', symbol: 'USDC' },
  { value: '0x4200000000000000000000000000000000000006', label: 'WETH', symbol: 'WETH' },
];

const PERIOD_OPTIONS = [
  { value: '3600', label: '1 Hour' },
  { value: '86400', label: '24 Hours' },
  { value: '604800', label: '1 Week' },
  { value: '2592000', label: '30 Days' },
];

export const SpendPermissionsManager: React.FC<SpendPermissionsManagerProps> = ({
  cdpWallet,
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateSpendPermissionParams>>({
    spender: '',
    token: TOKEN_OPTIONS[0].value,
    allowance: '',
    period: PERIOD_OPTIONS[1].value, // Default to 24 hours
  });

  // Validate spender address
  const isValidSpender = formData.spender && isAddress(formData.spender as `0x${string}`);
  const isValidAllowance = formData.allowance && !isNaN(parseFloat(formData.allowance));

  // Handle create permission
  const handleCreatePermission = async () => {
    if (!isValidSpender || !isValidAllowance) {
      toast.error('Please fill in all required fields correctly');
      return;
    }

    try {
      const allowanceInWei = parseEther(formData.allowance!).toString();
      
      await cdpWallet.createSpendPermission({
        spender: formData.spender as `0x${string}`,
        token: formData.token as `0x${string}`,
        allowance: allowanceInWei,
        period: formData.period!,
      });

      toast.success('Spend permission created successfully');
      setIsCreateDialogOpen(false);
      setFormData({
        spender: '',
        token: TOKEN_OPTIONS[0].value,
        allowance: '',
        period: PERIOD_OPTIONS[1].value,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create spend permission');
    }
  };

  // Handle revoke permission
  const handleRevokePermission = async (permissionHash: string) => {
    try {
      await cdpWallet.revokeSpendPermission(permissionHash);
      toast.success('Spend permission revoked successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke spend permission');
    }
  };

  // Format time period
  const formatPeriod = (seconds: string) => {
    const sec = parseInt(seconds);
    if (sec < 3600) return `${Math.floor(sec / 60)} minutes`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} hours`;
    return `${Math.floor(sec / 86400)} days`;
  };

  // Get token symbol
  const getTokenSymbol = (address: string) => {
    const token = TOKEN_OPTIONS.find(t => t.value.toLowerCase() === address.toLowerCase());
    return token?.symbol || 'Unknown';
  };

  if (!cdpWallet.smartAccount.isConnected || !cdpWallet.smartAccount.supportsSpendPermissions) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Create a Smart Account with Spend Permissions support to manage permissions.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Spend Permissions</span>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default">
                <Plus className="h-4 w-4 mr-1" />
                Create Permission
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Spend Permission</DialogTitle>
                <DialogDescription>
                  Grant a spender permission to use your Smart Account funds within specified limits.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="spender">Spender Address</Label>
                  <Input
                    id="spender"
                    placeholder="0x..."
                    value={formData.spender}
                    onChange={(e) => setFormData({ ...formData, spender: e.target.value })}
                  />
                  {formData.spender && !isValidSpender && (
                    <p className="text-sm text-red-500">Invalid address format</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="token">Token</Label>
                  <Select
                    value={formData.token}
                    onValueChange={(value) => setFormData({ ...formData, token: value })}
                  >
                    <SelectTrigger id="token">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOKEN_OPTIONS.map((token) => (
                        <SelectItem key={token.value} value={token.value}>
                          {token.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allowance">Allowance Amount</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="allowance"
                      type="number"
                      step="0.001"
                      placeholder="0.0"
                      value={formData.allowance}
                      onChange={(e) => setFormData({ ...formData, allowance: e.target.value })}
                    />
                    <div className="flex items-center px-3 bg-gray-100 rounded">
                      {getTokenSymbol(formData.token!)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="period">Reset Period</Label>
                  <Select
                    value={formData.period}
                    onValueChange={(value) => setFormData({ ...formData, period: value })}
                  >
                    <SelectTrigger id="period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_OPTIONS.map((period) => (
                        <SelectItem key={period.value} value={period.value}>
                          {period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500">
                    The allowance will reset after this period
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreatePermission}
                    disabled={!isValidSpender || !isValidAllowance || cdpWallet.isLoadingPermissions}
                  >
                    Create Permission
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
        <CardDescription>
          Manage spending permissions for AI agents and other applications
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Error display */}
        {cdpWallet.permissionsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{cdpWallet.permissionsError}</AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {cdpWallet.isLoadingPermissions && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {/* Permissions list */}
        {!cdpWallet.isLoadingPermissions && (
          <div className="space-y-3">
            {cdpWallet.spendPermissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No spend permissions created yet</p>
                <p className="text-sm mt-1">Create a permission to allow agents to spend on your behalf</p>
              </div>
            ) : (
              cdpWallet.spendPermissions.map((permission) => (
                <div
                  key={permission.permissionHash}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium">Spender</p>
                        {!permission.revoked ? (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Revoked
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-xs text-gray-600">
                        {permission.permission.spender}
                      </p>
                    </div>
                    {!permission.revoked && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRevokePermission(permission.permissionHash)}
                        disabled={cdpWallet.isLoadingPermissions}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 flex items-center">
                        <Coins className="h-3 w-3 mr-1" />
                        Token
                      </p>
                      <p className="font-medium">{getTokenSymbol(permission.permission.token)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Allowance</p>
                      <p className="font-medium">
                        {formatEther(BigInt(permission.permission.allowance))} {getTokenSymbol(permission.permission.token)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Period
                      </p>
                      <p className="font-medium">{formatPeriod(permission.permission.period)}</p>
                    </div>
                  </div>

                  {permission.revoked && permission.revokedAt && (
                    <p className="text-xs text-gray-500">
                      Revoked on {new Date(permission.revokedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Refresh button */}
        {cdpWallet.spendPermissions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4"
            onClick={() => cdpWallet.listSpendPermissions()}
            disabled={cdpWallet.isLoadingPermissions}
          >
            Refresh Permissions
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
