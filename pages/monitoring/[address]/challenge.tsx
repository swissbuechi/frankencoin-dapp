import Head from "next/head";
import { useRouter } from "next/router";
import AppBox from "@components/AppBox";
import Button from "@components/Button";
import DisplayAmount from "@components/DisplayAmount";
import TokenInput from "@components/Input/TokenInput";
import { erc20Abi, zeroAddress } from "viem";
import { useEffect, useState } from "react";
import { formatBigInt, formatDuration, shortenAddress } from "@utils";
import { useAccount, useBlockNumber, useChainId } from "wagmi";
import { Address } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { toast } from "react-toastify";
import { TxToast, renderErrorTxToast } from "@components/TxToast";
import DisplayLabel from "@components/DisplayLabel";
import GuardToAllowedChainBtn from "@components/Guards/GuardToAllowedChainBtn";
import { WAGMI_CHAIN, WAGMI_CONFIG } from "../../../app.config";
import { useSelector } from "react-redux";
import { RootState } from "../../../redux/redux.store";
import { useRouter as useNavigation } from "next/navigation";
import { ADDRESS, MintingHubV1ABI, MintingHubV2ABI } from "@frankencoin/zchf";
import DisplayOutputAlignedRight from "@components/DisplayOutputAlignedRight";
import AppLink from "@components/AppLink";
import { mainnet } from "viem/chains";
import GuardSupportedChain from "@components/Guards/GuardSupportedChain";

export default function PositionChallenge() {
	const [amount, setAmount] = useState(0n);
	const [error, setError] = useState("");
	const [isInit, setInit] = useState(false);
	const [isApproving, setApproving] = useState(false);
	const [isChallenging, setChallenging] = useState(false);
	const [isNavigating, setNavigating] = useState(false);

	const [userAllowance, setUserAllowance] = useState(0n);
	const [userBalance, setUserBalance] = useState(0n);

	const { data } = useBlockNumber({ watch: true });
	const account = useAccount();
	const router = useRouter();
	const navigate = useNavigation();

	const chainId = mainnet.id;
	const addressQuery: Address = router.query.address as Address;

	const positions = useSelector((state: RootState) => state.positions.list.list);
	const position = positions.find((p) => p.position == addressQuery);

	// ---------------------------------------------------------------------------
	useEffect(() => {
		const acc: Address | undefined = account.address;
		const fc: Address = ADDRESS[chainId].frankencoin;
		if (acc === undefined) return;
		if (!position || !position.collateral) return;

		const fetchAsync = async function () {
			const _balanceColl = await readContract(WAGMI_CONFIG, {
				address: position.collateral,
				chainId,
				abi: erc20Abi,
				functionName: "balanceOf",
				args: [acc],
			});
			setUserBalance(_balanceColl);

			const _allowanceColl = await readContract(WAGMI_CONFIG, {
				address: position.collateral,
				chainId,
				abi: erc20Abi,
				functionName: "allowance",
				args: [acc, position.version === 1 ? ADDRESS[chainId].mintingHubV1 : ADDRESS[chainId].mintingHubV2],
			});
			setUserAllowance(_allowanceColl);
		};

		fetchAsync();
	}, [data, account.address, position, chainId]);

	useEffect(() => {
		if (isNavigating && position?.position) {
			navigate.push(`/monitoring/${position.position}`);
		}
	}, [isNavigating, navigate, position]);

	useEffect(() => {
		if (isInit || position == undefined) return;
		setAmount(BigInt(position.collateralBalance));
		setInit(true);
	}, [isInit, position]);

	// ---------------------------------------------------------------------------
	if (!position) return null;

	const _collBal: bigint = BigInt(position.collateralBalance);
	const belowMinBalance: boolean = _collBal < BigInt(position.minimumCollateral);

	// ---------------------------------------------------------------------------
	const onChangeAmount = (value: string) => {
		var valueBigInt = BigInt(value);
		if (valueBigInt > _collBal && !belowMinBalance) {
			valueBigInt = _collBal;
		}
		setAmount(valueBigInt);
		if (valueBigInt > userBalance) {
			setError(`Not enough ${position.collateralSymbol} in your wallet.`);
		} else if (valueBigInt > BigInt(position.collateralBalance) && !belowMinBalance) {
			setError("Amount cannot be larger than the underlying position");
		} else if (valueBigInt < BigInt(position.minimumCollateral) && !belowMinBalance) {
			setError("Amount must be at least the minimum");
		} else {
			setError("");
		}
	};

	const handleApprove = async () => {
		try {
			setApproving(true);

			const approveWriteHash = await writeContract(WAGMI_CONFIG, {
				address: position.collateral as Address,
				chainId,
				abi: erc20Abi,
				functionName: "approve",
				args: [position.version === 1 ? ADDRESS[chainId].mintingHubV1 : ADDRESS[chainId].mintingHubV2, amount],
			});

			const toastContent = [
				{
					title: "Amount:",
					value: formatBigInt(amount, position.collateralDecimals) + " " + position.collateralSymbol,
				},
				{
					title: "Spender: ",
					value: shortenAddress(ADDRESS[chainId].mintingHubV1),
				},
				{
					title: "Transaction:",
					hash: approveWriteHash,
				},
			];

			await toast.promise(waitForTransactionReceipt(WAGMI_CONFIG, { hash: approveWriteHash, confirmations: 1 }), {
				pending: {
					render: <TxToast title={`Approving ${position.collateralSymbol}`} rows={toastContent} />,
				},
				success: {
					render: <TxToast title={`Successfully Approved ${position.collateralSymbol}`} rows={toastContent} />,
				},
			});
		} catch (error) {
			toast.error(renderErrorTxToast(error));
		} finally {
			setApproving(false);
		}
	};

	const handleChallenge = async () => {
		try {
			setChallenging(true);

			const challengeWriteHash = await writeContract(WAGMI_CONFIG, {
				address: position.version === 1 ? ADDRESS[chainId].mintingHubV1 : ADDRESS[chainId].mintingHubV2,
				chainId,
				abi: position.version === 1 ? MintingHubV1ABI : MintingHubV2ABI,
				functionName: "challenge",
				args: [position.position, amount, BigInt(position.price)],
			});

			const toastContent = [
				{
					title: "Size:",
					value: formatBigInt(amount, position.collateralDecimals) + " " + position.collateralSymbol,
				},
				{
					title: "Price: ",
					value: formatBigInt(BigInt(position.price), 36 - position.collateralDecimals) + " ZCHF",
				},
				{
					title: "Transaction:",
					hash: challengeWriteHash,
				},
			];

			await toast.promise(waitForTransactionReceipt(WAGMI_CONFIG, { hash: challengeWriteHash, confirmations: 1 }), {
				pending: {
					render: <TxToast title={`Launching a challenge`} rows={toastContent} />,
				},
				success: {
					render: <TxToast title={`Successfully Launched challenge`} rows={toastContent} />,
				},
			});

			setNavigating(true);
		} catch (error) {
			toast.error(renderErrorTxToast(error));
		} finally {
			setChallenging(false);
		}
	};

	return (
		<>
			<Head>
				<title>Frankencoin - Challenge</title>
			</Head>

			{/* <div>
				<AppPageHeader title="Lunch A Challenge" />
			</div> */}

			<div className="md:mt-8">
				<section className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col gap-y-4">
						<div className="text-lg font-bold text-center mt-3">Launch A Challenge</div>
						<TokenInput
							symbol={position.collateralSymbol}
							min={BigInt(position.minimumCollateral)}
							max={userBalance > BigInt(position.collateralBalance) ? BigInt(position.collateralBalance) : userBalance}
							balanceLabel="Your balance:"
							digit={position.collateralDecimals}
							value={amount.toString()}
							onChange={onChangeAmount}
							error={error}
							label="Amount"
							placeholder="Collateral Amount"
							limit={userBalance > BigInt(position.collateralBalance) ? BigInt(position.collateralBalance) : userBalance}
							limitDigit={position.collateralDecimals}
							limitLabel="Maximum"
						/>
						<div className="grid grid-cols-6 gap-2 lg:col-span-2">
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Starting Price" />
								<DisplayAmount
									amount={BigInt(position.price)}
									currency={"ZCHF"}
									digits={36 - position.collateralDecimals}
									address={ADDRESS[chainId].frankencoin}
								/>
							</AppBox>
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Potential Reward" />
								<DisplayAmount
									amount={(BigInt(position.price) * amount * 2n) / 100n}
									currency={"ZCHF"}
									digits={36}
									address={ADDRESS[chainId].frankencoin}
								/>
							</AppBox>
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Collateral in Position" />
								<DisplayAmount
									amount={BigInt(position.collateralBalance)}
									currency={position.collateralSymbol}
									digits={position.collateralDecimals}
									address={position.collateral}
								/>
							</AppBox>
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Minimum Amount" />
								<DisplayAmount
									amount={BigInt(position.minimumCollateral)}
									currency={position.collateralSymbol}
									digits={position.collateralDecimals}
									address={position.collateral}
								/>
							</AppBox>
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Phase duration" />
								<DisplayOutputAlignedRight output={formatDuration(position.challengePeriod)} />
							</AppBox>
							<AppBox className="col-span-6 sm:col-span-3">
								<DisplayLabel label="Target Position" />
								<AppLink
									label={shortenAddress(position.position || zeroAddress)}
									href={`/monitoring/${position.position}`}
								/>
							</AppBox>
						</div>
						<div className="mx-auto mt-4 w-[20rem] max-w-full flex-col">
							<GuardSupportedChain chain={mainnet}>
								{amount > userAllowance ? (
									<Button isLoading={isApproving} disabled={!!error} onClick={() => handleApprove()}>
										Approve
									</Button>
								) : (
									<Button isLoading={isChallenging} disabled={!!error || amount == 0n} onClick={() => handleChallenge()}>
										Challenge
									</Button>
								)}
							</GuardSupportedChain>
						</div>
					</div>
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col">
						<div className="text-lg font-bold text-center mt-3 text-text-primary">How does it work?</div>
						<div className="flex-1 mt-4 text-text-secondary">
							<p>A challenge is divided into two phases:</p>
							<ol className="flex flex-col gap-y-2 pl-6 [&>li]:list-decimal">
								<li>
									During the fixed price phase, anyone can buy the {position.collateralSymbol} you provided at the
									liquidation price of {formatBigInt(BigInt(position.price), 36 - position.collateralDecimals)} ZCHF each.
								</li>
								<li>
									If there are any {position.collateralSymbol} left after the fixed price phase ends, you get the
									remaining {position.collateralSymbol} back and the price starts to decline towards zero. In this phase,
									the bidders are not buying from the challenger any more, but from the position owner. You will get 2% of
									the sales proceeds as a reward.
								</li>
							</ol>
						</div>
					</div>
				</section>
			</div>
		</>
	);
}
